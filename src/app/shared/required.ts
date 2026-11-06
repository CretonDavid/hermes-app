import { AbstractControl, Validators } from '@angular/forms';

/**
 * Rend un champ obligatoire ou non selon l'état du formulaire. À préférer à l'attribut [required]
 * sur un champ affiché sous condition : quand le champ disparaît, l'attribut ne revalide pas le
 * contrôle, qui peut rester en erreur et bloquer le formulaire sans rien afficher.
 */
export function setRequired(control: AbstractControl, required: boolean): void {
  if (required === control.hasValidator(Validators.required)) {
    return;
  }
  if (required) {
    control.addValidators(Validators.required);
  } else {
    control.removeValidators(Validators.required);
  }
  control.updateValueAndValidity({ emitEvent: false });
}
