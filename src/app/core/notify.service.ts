import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from './models';

/**
 * Extrait un message lisible d'une erreur HTTP renvoyée par l'API.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "Impossible de joindre l'API. Est-elle démarrée ?";
    }
    const body = error.error as ApiError | null;
    if (body?.fieldErrors) {
      return Object.values(body.fieldErrors).join(' · ');
    }
    if (body?.message) {
      return body.message;
    }
    return `Erreur ${error.status}`;
  }
  return 'Une erreur inattendue est survenue';
}

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'OK');
  }

  // Message plus long, avec un bouton pour revenir en arrière
  successWithUndo(message: string, undo: () => void): void {
    this.snackBar.open(message, 'Annuler', { duration: 8000 }).onAction().subscribe(undo);
  }

  error(error: unknown): void {
    this.snackBar.open(typeof error === 'string' ? error : errorMessage(error), 'Fermer', {
      duration: 7000,
    });
  }
}
