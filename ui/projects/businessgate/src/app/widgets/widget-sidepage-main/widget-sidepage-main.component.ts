import { Component, OnInit } from '@angular/core';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-sidepage-main',
  templateUrl: './widget-sidepage-main.component.html',
  styleUrls: ['./widget-sidepage-main.component.less']
})
export class WidgetSidepageMainComponent implements OnInit {

  constructor(private widgets: WidgetsService) { }

  ngOnInit(): void {
  }

  select(page) {
    this.widgets.sidePage.next(page);
  }

}
