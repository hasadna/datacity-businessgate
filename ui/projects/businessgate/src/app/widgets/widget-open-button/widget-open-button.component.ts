import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-open-button',
  templateUrl: './widget-open-button.component.html',
  styleUrls: ['./widget-open-button.component.less']
})
export class WidgetOpenButtonComponent implements OnInit {

  constructor(public widgets: WidgetsService, private router: Router) { }

  ngOnInit(): void {
  }

  get visible(): boolean {
    return !this.widgets.selecting;
  }

  get fragment(): string | null {
    if (!!this.widgets.openStack) {
      return null;
    }
    return 'menu:main';
  }

  get imgSrc(): string {
    if (!!this.widgets.openStack) {
      return 'assets/img/close.svg';
    }
    return 'assets/img/hamburger.svg';
  }

  click() {
    if (!!this.widgets.openStack) {
      this.widgets.openStack.openState.next(false);
    } else {
      this.router.navigate([], { fragment: this.fragment });
    }
  }
}
