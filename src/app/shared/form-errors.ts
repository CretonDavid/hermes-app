import { Injectable } from '@angular/core';
import { AbstractControl, FormGroupDirective, NgForm } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

// Formulaires dont l'utilisateur a demandé l'enregistrement : leurs erreurs s'affichent toutes
const submitAttempted = new WeakSet<AbstractControl>();

/** A appeler quand l'enregistrement échoue : affiche les erreurs de tous les champs du formulaire */
export function showFormErrors(form: AbstractControl): void {
  submitAttempted.add(form.root);
  form.markAllAsTouched();
}

/** L'utilisateur a demandé l'enregistrement du formulaire de ce champ */
export function saveAttempted(control: AbstractControl): boolean {
  return submitAttempted.has(control.root);
}

/**
 * Erreurs affichées seulement après une tentative d'enregistrement, même si le champ a été
 * modifié : pour les champs dont un message voisin guide déjà la saisie.
 */
export const AFTER_SAVE_ERRORS: ErrorStateMatcher = {
  isErrorState: (control, form) =>
    !!control && control.invalid && (!!form?.submitted || saveAttempted(control)),
};

/**
 * Un champ ne passe en rouge que si l'utilisateur y a saisi quelque chose, ou s'il a tenté
 * d'enregistrer. Le comportement par défaut de Material (champ quitté) signalait une erreur
 * sur un champ obligatoire simplement traversé, sans aucune saisie.
 */
@Injectable()
export class EditedErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: AbstractControl | null, form: FormGroupDirective | NgForm | null): boolean {
    return (
      !!control &&
      control.invalid &&
      (control.dirty || !!form?.submitted || submitAttempted.has(control.root))
    );
  }
}
