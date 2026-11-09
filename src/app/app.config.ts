import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeFr from '@angular/common/locales/fr';
import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { fr } from 'date-fns/locale';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { loadingInterceptor } from './core/loading.service';
import { FrDatepickerIntl, FrPaginatorIntl } from './core/material-intl';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor])),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },
    { provide: MAT_DATE_LOCALE, useValue: fr },
    provideDateFnsAdapter({
      parse: { dateInput: ['dd/MM/yyyy', 'dd/MM/yy', 'ddMMyyyy', 'd/M/yyyy'] },
      display: {
        dateInput: 'dd/MM/yyyy',
        monthYearLabel: 'LLL yyyy',
        dateA11yLabel: 'PP',
        monthYearA11yLabel: 'LLLL yyyy',
      },
    }),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
    // Sans ce réglage, Material plafonne les fenêtres à 560 px quelle que soit leur largeur
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: { ...new MatDialogConfig(), maxWidth: '92vw', maxHeight: '92vh' },
    },
    { provide: MatPaginatorIntl, useClass: FrPaginatorIntl },
    { provide: MatDatepickerIntl, useClass: FrDatepickerIntl },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { duration: 4000, verticalPosition: 'bottom' },
    },
  ],
};
