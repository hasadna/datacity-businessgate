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
  lastAnimationCount = -1;

  constructor(private widgets: WidgetsService, public stacks: StacksService) { }

  ngOnInit(): void {
    timer(1000).subscribe(() => {
      this.lastAnimationCount = this.stacks.stack_count;
    });
    this.stacks.closedStack.subscribe(() => {
      if (this.stacks.stack_count === this.lastAnimationCount) {
        return;
      }
      this.lastAnimationCount = this.stacks.stack_count;
      if (this.newStackAnimation === null) {
        this.newStackAnimation = true;
        from([true]).pipe(
          delay(1000),
          tap(() => {
            this.stacks.updateVisibleCount();
          }),
          switchMap(() => {
            if (this.stacks.updateDiscovery()) {
              return this.removedDiscovery;
            } else {
              return from([true]);
            }
          }),
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

