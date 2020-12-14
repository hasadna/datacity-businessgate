import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReplaySubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class I18nService {

  ltr = false;
  public lang = new ReplaySubject<string>(1);

  constructor(private activatedRoute: ActivatedRoute, private router: Router) {
    this.activatedRoute.queryParamMap.subscribe((queryParamMap) => {
      const lang = queryParamMap.get('lang') || '_';
      this.ltr = lang === 'en' || lang === 'es' || lang === 'ru' || lang === 'fr';
      this.lang.next(lang);
    });
  }
}
