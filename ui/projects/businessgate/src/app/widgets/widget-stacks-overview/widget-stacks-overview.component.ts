import { Component, OnInit } from '@angular/core';
import { filter } from 'rxjs/operators';
import { StacksService } from '../../stacks.service';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-stacks-overview',
  templateUrl: './widget-stacks-overview.component.html',
  styleUrls: ['./widget-stacks-overview.component.less']
})
export class WidgetStacksOverviewComponent implements OnInit {

  open = false;

  constructor(private widgets: WidgetsService, public stacks: StacksService) {
    this.widgets.stacksPage.pipe(
      filter((x) => x === 'overview')
    ).subscribe(() => {
      this.open = true;
    })
  }

  ngOnInit(): void {
  }

  close() {
    this.open = false;
  }

  selectStack(stack) {
    this.widgets.stacksPage.next(stack);
  }

  params() {
    return {
      __runner: this.stacks.runner
    };
  }

  business_name() {
    return (this.stacks.runner.record._business_record || {}).business_kind_name 
               || 'עסק';
  }

  location() {
    return (this.stacks.runner.record.location || {}).שם
               || 'העיר באר-שבע';
  }

  scroll(event: MouseEvent) {
    const el = (event.target as HTMLElement).parentElement.querySelector('.scroller');
    el.scrollBy({left: -140, behavior: 'smooth'});
  }
}
