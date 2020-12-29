import { AfterContentInit, Component, OnInit, ViewChild } from '@angular/core';
import { ContentManager } from 'hatool';
import { merge, ReplaySubject, Subject } from 'rxjs';
import { tap, switchMap, filter, delay, first } from 'rxjs/operators';
import { ChatMsgCardStackComponent } from '../../chat-msgs/chat-msg-card-stack/chat-msg-card-stack.component';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-widget-stack',
  templateUrl: './widget-stack.component.html',
  styleUrls: ['./widget-stack.component.less']
})
export class WidgetStackComponent implements OnInit, AfterContentInit {

  @ViewChild(ChatMsgCardStackComponent, {static: false}) stackEl: ChatMsgCardStackComponent;

  open = false;
  stackObs: ReplaySubject<any> = null;
  params = null;
  content: ContentManager = null;
  closeRequest = new Subject<any>();
  
  constructor(private widgets: WidgetsService) {
  }

  ngOnInit(): void {
  }

  ngAfterContentInit(): void {
    this.initListener();
  }

  initListener() {
    this.widgets.stackActive.pipe(
      filter((stack) => !!stack),
      tap((stack: any) => {
        this.content = stack.content;
        this.params = stack.params;
        this.open = true;
      }),
      filter((stack) => !!stack),
      delay(1),
      switchMap(() => {
        return this.stackEl.stackEl.init;
      }),
      filter((x) => x),
      switchMap(() => {
        this.stackEl.stackEl.openState.next(true);
        return merge(
          this.closeRequest,
          this.stackEl.wait(),
          this.widgets.stackActive.pipe(filter((x) => x === null))
        );
      }),
      first(),
      tap(() => {
        this.stackEl.stackEl.openState.next(false);
        this.content = null;
        this.params = null;
        this.open = false;
        this.widgets.stackActive.next(null);
      }),
    ).subscribe((response) => {
      this.widgets.stackResult.next(response);
      this.initListener();
    });
  }
}
