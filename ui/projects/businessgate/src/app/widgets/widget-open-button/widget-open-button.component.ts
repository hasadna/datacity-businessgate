import { Component, OnInit } from '@angular/core';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-open-button',
  templateUrl: './widget-open-button.component.html',
  styleUrls: ['./widget-open-button.component.less']
})
export class WidgetOpenButtonComponent implements OnInit {

  constructor(public widgets: WidgetsService) { }

  ngOnInit(): void {
  }
}
