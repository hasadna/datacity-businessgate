import { AfterContentInit, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
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

  @ViewChild(ChatMsgCardStackComponent) stackEl: ChatMsgCardStackComponent;

  open = false;
  stackObs: ReplaySubject<any> = null;
  params = null;
  content: ContentManager = null;
  closeRequest = new Subject<any>();

  name = 'app-widget-stack';
  
  constructor(private widgets: WidgetsService, private changeDetector : ChangeDetectorRef) {
    this.name += '-' + Math.random();
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
        this.changeDetector.detectChanges();
      }),
      delay(0),
      switchMap(() => {
        return this.stackEl.stackEl.init;
      }),
      filter((x) => x),
      switchMap(() => {
        // console.log('OPENING STACK 1', this.stackEl, this.stackEl?.stackEl);
        this.stackEl.stackEl.openState.next(true);
        return merge(
          this.closeRequest,
          this.stackEl.wait(),
          this.widgets.stackActive.pipe(filter((x) => x === null))
        );
      }),
      first(),
      tap(() => {
        // console.log('CLOSING STACK 4');
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
