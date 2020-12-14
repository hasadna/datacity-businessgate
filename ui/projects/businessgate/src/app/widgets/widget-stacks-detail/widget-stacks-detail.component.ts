import { Component, OnInit, ViewChild } from '@angular/core';
import { delay, filter, tap } from 'rxjs/operators';
import { StacksService } from '../../stacks.service';
import { WidgetsService } from '../../widgets.service';
import { CardStackComponent } from '../../card-stack/card-stack.component';

@Component({
  selector: 'app-widget-stacks-detail',
  templateUrl: './widget-stacks-detail.component.html',
  styleUrls: ['./widget-stacks-detail.component.less']
})
export class WidgetStacksDetailComponent implements OnInit {

  open = false;
  stack_name = '';

  @ViewChild(CardStackComponent, {static: false}) cardStack: CardStackComponent;

  constructor(private widgets: WidgetsService, public stacks: StacksService) {
    this.widgets.stacksPage.pipe(
      filter((x) => x !== 'overview'),
      tap((stack_name) => {
        this.stack_name = stack_name;
        this.open = true;  
      }),
      delay(1),
      tap(() => {
        this.cardStack.openState.next(true);
      })
    ).subscribe((stack_name) => {});
  }

  ngOnInit(): void {
  }

  close() {
    if (this.cardStack) {
      this.cardStack.openState.next(false);
    }
    this.stack_name = '';
    this.open = false;
  }

  get record() {
    return this.stacks.runner.record;
  }

  get params() {
    return {
      __runner: this.stacks.runner
    };
  }
}
