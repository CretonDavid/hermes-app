import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { DataStore } from '../data.store';
import { authGuard, guestGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = environment.apiUrl;
const tokens = (n: number) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}` });

describe('authentification', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let store: { clear: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    store = { clear: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: DataStore, useValue: store },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  const signIn = (n = 1) => {
    auth.login('1'.repeat(30)).subscribe();
    http.expectOne(`${API}/auth/login`).flush(tokens(n));
  };

  describe('AuthService', () => {
    it('mémorise les jetons à la connexion', () => {
      signIn();
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.token).toBe('access-1');
      expect(localStorage.getItem('hermes.refresh_token')).toBe('refresh-1');
    });

    it('ne lance qu’un rafraîchissement à la fois', () => {
      signIn();
      const results: string[] = [];
      auth.refresh().subscribe((t) => results.push(t.access_token));
      auth.refresh().subscribe((t) => results.push(t.access_token));

      const request = http.expectOne(`${API}/auth/refresh`);
      expect(request.request.body).toEqual({ refresh_token: 'refresh-1' });
      request.flush(tokens(2));

      expect(results).toEqual(['access-2', 'access-2']);
      expect(localStorage.getItem('hermes.refresh_token')).toBe('refresh-2');
    });

    it('reprend les jetons renouvelés entre-temps par un autre onglet', () => {
      signIn();
      let received: string | undefined;
      auth.refresh().subscribe((t) => (received = t.access_token));

      // L'autre onglet a déjà échangé le même refresh token
      localStorage.setItem('hermes.access_token', 'access-autre-onglet');
      localStorage.setItem('hermes.refresh_token', 'refresh-autre-onglet');
      http
        .expectOne(`${API}/auth/refresh`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(received).toBe('access-autre-onglet');
      expect(auth.token).toBe('access-autre-onglet');
    });

    it('échoue sans refresh token', () => {
      let failed = false;
      auth.refresh().subscribe({ error: () => (failed = true) });
      expect(failed).toBe(true);
    });

    it('révoque la session et oublie toutes les données à la déconnexion', () => {
      signIn();
      auth.logout();

      const revoke = http.expectOne(`${API}/auth/logout`);
      expect(revoke.request.body).toEqual({ refresh_token: 'refresh-1' });
      revoke.flush(null, { status: 204, statusText: 'No Content' });

      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.hasRefreshToken()).toBe(false);
      expect(store.clear).toHaveBeenCalled();
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    });

    it('se déconnecte localement même si la révocation échoue', () => {
      signIn();
      auth.logout(false);
      http.expectOne(`${API}/auth/logout`).error(new ProgressEvent('error'));
      expect(auth.isAuthenticated()).toBe(false);
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    });

    it('suit la connexion et la déconnexion faites dans un autre onglet', () => {
      localStorage.setItem('hermes.access_token', 'access-autre-onglet');
      window.dispatchEvent(new StorageEvent('storage', { key: 'hermes.access_token' }));
      expect(auth.token).toBe('access-autre-onglet');

      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('authInterceptor', () => {
    it('ajoute le jeton aux appels de l’API, pas aux autres', () => {
      signIn();
      client.get(`${API}/accounts`).subscribe();
      client.get('https://exemple.org/donnees').subscribe();

      expect(http.expectOne(`${API}/accounts`).request.headers.get('Authorization')).toBe(
        'Bearer access-1',
      );
      expect(
        http.expectOne('https://exemple.org/donnees').request.headers.has('Authorization'),
      ).toBe(false);
    });

    it('rafraîchit la session sur un 401 puis rejoue la requête', () => {
      signIn();
      let body: unknown;
      client.get(`${API}/accounts`).subscribe((b) => (body = b));

      http.expectOne(`${API}/accounts`).flush(null, { status: 401, statusText: 'Unauthorized' });
      http.expectOne(`${API}/auth/refresh`).flush(tokens(2));
      const retry = http.expectOne(`${API}/accounts`);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
      retry.flush([{ id: 1 }]);

      expect(body).toEqual([{ id: 1 }]);
    });

    it('déconnecte quand le rafraîchissement est refusé', () => {
      signIn();
      let failed = false;
      client.get(`${API}/accounts`).subscribe({ error: () => (failed = true) });

      http.expectOne(`${API}/accounts`).flush(null, { status: 401, statusText: 'Unauthorized' });
      http
        .expectOne(`${API}/auth/refresh`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      http.expectOne(`${API}/auth/logout`).flush(null);

      expect(failed).toBe(true);
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('déconnecte sur un 401 sans refresh token', () => {
      client.get(`${API}/accounts`).subscribe({ error: () => undefined });
      http.expectOne(`${API}/accounts`).flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    });

    it('laisse passer les autres erreurs', () => {
      signIn();
      let status = 0;
      client.get(`${API}/accounts`).subscribe({ error: (e) => (status = e.status) });
      http.expectOne(`${API}/accounts`).flush(null, { status: 500, statusText: 'Server Error' });
      expect(status).toBe(500);
    });
  });

  describe('gardes de navigation', () => {
    const run = (guard: typeof authGuard) =>
      TestBed.runInInjectionContext(() => guard({} as never, {} as never));

    it('réserve l’application aux utilisateurs connectés', () => {
      expect(run(authGuard)).toBeInstanceOf(UrlTree);
      signIn();
      expect(run(authGuard)).toBe(true);
    });

    it('accepte une session à rafraîchir', () => {
      localStorage.setItem('hermes.refresh_token', 'refresh-1');
      expect(run(authGuard)).toBe(true);
    });

    it('renvoie un utilisateur connecté vers l’accueil depuis la connexion', () => {
      expect(run(guestGuard)).toBe(true);
      signIn();
      expect(run(guestGuard)).toBeInstanceOf(UrlTree);
    });
  });
});
