import { FormControl, FormGroup, Validators } from '@angular/forms';
import { EditedErrorStateMatcher, showFormErrors } from './form-errors';

describe('EditedErrorStateMatcher', () => {
  const matcher = new EditedErrorStateMatcher();
  const build = () => new FormGroup({ amount: new FormControl('', Validators.required) });

  it("n'affiche pas d'erreur sur un champ obligatoire simplement traversé", () => {
    const form = build();
    form.controls.amount.markAsTouched();
    expect(matcher.isErrorState(form.controls.amount, null)).toBe(false);
  });

  it("affiche l'erreur dès que l'utilisateur a saisi quelque chose", () => {
    const form = build();
    form.controls.amount.markAsDirty();
    expect(matcher.isErrorState(form.controls.amount, null)).toBe(true);
  });

  it("affiche toutes les erreurs après une tentative d'enregistrement", () => {
    const form = build();
    showFormErrors(form);
    expect(matcher.isErrorState(form.controls.amount, null)).toBe(true);
  });

  it("n'affiche rien sur un champ valide", () => {
    const form = build();
    form.controls.amount.setValue('12');
    form.controls.amount.markAsDirty();
    showFormErrors(form);
    expect(matcher.isErrorState(form.controls.amount, null)).toBe(false);
  });
});
