import { Component, OnInit } from '@angular/core';
import { delay, from, ReplaySubject, switchMap, tap, timer } from 'rxjs';
import { StacksService } from '../../stacks.service';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-stacks-button',
  templateUrl: './widget-stacks-button.component.html',
  styleUrls: ['./widget-stacks-button.component.less']
})
export class WidgetStacksButtonComponent implements OnInit {

  newStackAnimation: boolean = null;
  removedDiscovery = new ReplaySubject<void>(1);

  constructor(private widgets: WidgetsService, public stacks: StacksService) { }

  ngOnInit(): void {
    this.stacks.closedStack.subscribe(() => {
      if (this.newStackAnimation === null) {
        this.newStackAnimation = true;
        from([true]).pipe(
          delay(1000),
          tap(() => {
            this.stacks.updateVisibleCount();
          }),
          tap(() => {
            this.stacks.updateDiscovery();
          }),
          switchMap(() => this.removedDiscovery),
          tap(() => {
            this.newStackAnimation = false;
          }),
          delay(300),
          tap(() => {
            this.newStackAnimation = null;
          })
        ).subscribe(() => {});    
      }
    });
  }

  openOverview() {
    this.stacks.discovery = false;
    this.widgets.stacksPage.next('overview');
  }

  removeDiscovery() {
    this.stacks.discovery = false;
    this.removedDiscovery.next();
  }

  get active() {
    return this.stacks.visible || this.newStackAnimation;
  }
}

