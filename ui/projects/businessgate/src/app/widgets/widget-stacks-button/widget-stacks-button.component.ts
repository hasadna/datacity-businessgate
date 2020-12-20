import { Component, OnInit } from '@angular/core';
import { StacksService } from '../../stacks.service';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-stacks-button',
  templateUrl: './widget-stacks-button.component.html',
  styleUrls: ['./widget-stacks-button.component.less']
})
export class WidgetStacksButtonComponent implements OnInit {

  constructor(private widgets: WidgetsService, public stacks: StacksService) { }

  ngOnInit(): void {
  }

  openOverview() {
    this.stacks.discovery = false;
    this.widgets.stacksPage.next('overview');
  }
}

