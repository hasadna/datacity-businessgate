import { Component, Input, OnInit } from '@angular/core';
import { WidgetsService } from '../../widgets.service';

import { delay, filter, tap } from 'rxjs/operators';

@Component({
  selector: 'app-widget-sidepage-base',
  templateUrl: './widget-sidepage-base.component.html',
  styleUrls: ['./widget-sidepage-base.component.less']
})
export class WidgetSidepageBaseComponent implements OnInit {

  @Input() page;
  @Input() limitWidth = false;
  open = false;

  constructor(private widgets: WidgetsService) {
    this.widgets.sidePage.pipe(
      filter((x) => x === this.page),
      delay(0),
    ).subscribe(() => {
      this.open = true;
    });
    this.widgets.sidePage.pipe(
      filter((x) => x === null),
      delay(0),
    ).subscribe(() => {
      this.open = false;
    });
  }

  ngOnInit(): void {
  }

}
