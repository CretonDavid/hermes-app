import { Injectable } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';

// Textes des composants Angular Material, en anglais par défaut

@Injectable()
export class FrPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Lignes par page';
  override nextPageLabel = 'Page suivante';
  override previousPageLabel = 'Page précédente';
  override firstPageLabel = 'Première page';
  override lastPageLabel = 'Dernière page';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) {
      return '0 sur 0';
    }
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return `${start} – ${end} sur ${length}`;
  };
}

@Injectable()
export class FrDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Calendrier';
  override openCalendarLabel = 'Ouvrir le calendrier';
  override closeCalendarLabel = 'Fermer le calendrier';
  override prevMonthLabel = 'Mois précédent';
  override nextMonthLabel = 'Mois suivant';
  override prevYearLabel = 'Année précédente';
  override nextYearLabel = 'Année suivante';
  override prevMultiYearLabel = '24 années précédentes';
  override nextMultiYearLabel = '24 années suivantes';
  override switchToMonthViewLabel = 'Choisir une date';
  override switchToMultiYearViewLabel = 'Choisir le mois et l’année';
  override startDateLabel = 'Date de début';
  override endDateLabel = 'Date de fin';
}
