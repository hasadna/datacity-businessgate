import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReplaySubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StateService {

  state = new ReplaySubject<string[]>(1);
  _current = [];

  constructor(private router: Router) { }
  
  init(activatedRoute: ActivatedRoute) {
    activatedRoute.fragment.subscribe((fragment) => {
      console.log('FRAGMENT!', fragment);
      fragment = fragment || '';
      this._current = fragment.split('|').filter((x) => x.length > 0);
      this.state.next(this._current);
      if (window['gtag']) {
        window['gtag']('event', 'nav', {
          'event_category': 'fragment',
          'event_label': fragment
        });
      }
    });
  }

  addState(x) {
    if (!this.inState(this._current, x)) {
      return [...this._current, x].join('|');
    }
  }

  pushState(x) {
    this.router.navigate([], {fragment: this.addState(x)});
  }

  removeState(x) {
    return [...this._current.filter((i) => i !== x)].join('|');
  }

  popState(x) {
    this.router.navigate([], {fragment: this.removeState(x)});
  }

  inState(state: string[], x) {
    return state.indexOf(x) >= 0;
  }
}
