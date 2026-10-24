import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotifyService } from '../notify.service';
import { AuthService } from './auth.service';

const withToken = (request: HttpRequest<unknown>, token: string | null) =>
  token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

/**
 * Ajoute le JWT aux appels de l'API. Sur un 401, tente un refresh puis rejoue la requête une fois ;
 * si le refresh échoue, l'utilisateur est déconnecté.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiUrl) || request.url.includes('/auth/')) {
    return next(request);
  }

  const auth = inject(AuthService);
  const notify = inject(NotifyService);
  return next(withToken(request, auth.token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      if (!auth.hasRefreshToken()) {
        auth.logout();
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          notify.error('Votre session a expiré, veuillez vous reconnecter.');
          auth.logout();
          return throwError(() => refreshError);
        }),
        switchMap((tokens) => next(withToken(request, tokens.access_token))),
      );
    }),
  );
};
