import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReplaySubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StateService {

  state = new ReplaySubject<string[]>(1);
  _current = [];
  activatedRoute: ActivatedRoute;

  constructor(private router: Router) { }
  
  init(activatedRoute: ActivatedRoute) {
    this.activatedRoute = activatedRoute;
    activatedRoute.fragment.subscribe((fragment) => {
      console.log('FRAGMENT!', fragment);
      fragment = fragment || '';
      this._current = fragment.split('|').filter((x) => x.length > 0);
      this.state.next(this._current);
    });
  }

  addState(kind, x) {
    if (!this.inState(this._current, kind, x)) {
      if (window['gtag']) {
        window['gtag']('event', 'nav', {
          'event_category': kind,
          'event_label': x
        });
      }
      return [...this._current.filter((i) => i.indexOf(kind + ':') !== 0), kind + ':' + x].join('|');
    }
  }

  pushState(kind, x) {
    this.router.navigate([], {fragment: this.addState(kind, x), relativeTo: this.activatedRoute});
  }

  removeState(kind) {
    return [...this._current.filter((i) => i.indexOf(kind + ':') !== 0)].join('|');
  }

  popState(kind) {
    this.router.navigate([], {fragment: this.removeState(kind)});
  }

  inState(state: string[], kind, x) {
    return state.indexOf(kind + ':' + x) >= 0;
  }
}
