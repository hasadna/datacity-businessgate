import { Component, OnInit } from '@angular/core';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-stack-backdrop',
  templateUrl: './widget-stack-backdrop.component.html',
  styleUrls: ['./widget-stack-backdrop.component.less'],
  host: {
    '[class.visible]': 'widgets.showStackBackdrop',
  }
})
export class WidgetStackBackdropComponent implements OnInit {

  constructor(public widgets: WidgetsService) { }

  ngOnInit(): void {
  }

}
