import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ContentManager, ScriptRunnerImpl } from 'hatool';
import { ReplaySubject, Subscription, timer } from 'rxjs';
import { delay, filter, first, map, switchMap, tap } from 'rxjs/operators';
import { DataService } from '../../data.service';
import { BackendService } from '../../backend.service';
import { StacksService } from '../../stacks.service';
import { CardStackComponent } from '../../card-stack/card-stack.component';
import { MainScrollService } from '../../main-scroll.service';
import { StateService } from '../../state.service';

@Component({
  selector: 'app-chat-msg-card-stack',
  templateUrl: './chat-msg-card-stack.component.html',
  styleUrls: ['./chat-msg-card-stack.component.less']
})
export class ChatMsgCardStackComponent implements OnInit {

  @Input() params;
  @Input() content: ContentManager;
  @Input() small = true;
  @ViewChild(CardStackComponent, {static: true}) stackEl: CardStackComponent;

  runner: ScriptRunnerImpl;
  args: any = {};
  record: any = {};
  variable: string;
  variable2: string;
  stacks: any[] = [];
  stack: any = null;
  stateName = '';
  opened = false;
  
  vScrollSub: Subscription = null;
  mainScrollPosition: number = null;

  closeVisible = true;
  selectorsSlidden = false;
  mapVisible = false;
    
  returned = new ReplaySubject<string|null>();
  init = new ReplaySubject<void>(1);

  constructor(private data: DataService, 
              private backend: BackendService, 
              public stacksSvc: StacksService,
              private hostElement: ElementRef,
              private mainScroll: MainScrollService,
              ) {
    this.slideSelectors(false);
    this.initStackListener();
  }

  initStackListener() {
    this.init.pipe(
      switchMap(() => {
        return this.data.stacks;
      }),
      first(),
      map((result: any[]) => {
        if (this.args.stack) {
          return [result[this.args.stack]];
        } else if (this.args.stacks) {
          return this.args.stacks.map((s) => result[s]);
        } else if (this.args.stacksFrom) {
          return this.record[this.args.stacksFrom].map(
            (s) => s.name ? s : result[s]
          );
        }
      }),
      delay(0)
    ).subscribe((result) => {
      this.stacks = result;
      this.stacksSvc.registerStacks(this.stacks, (x) => this.params.__runner.fillIn(x));
      this.record.stack_count = this.stacksSvc.stack_count;
      if (result.length === 1) {
        this.stack = result[0];
      }
      if (this.params.__runFast) {
        this.stacksSvc.discoveryRequested = false;
        this.stacksSvc.updateVisibleCount();
        if (this.variable) {
          if (this.record[this.variable]) {
            this.returnValue(this.record[this.variable]);
          }
        } else {
          this.returnValue();
        }
      }
    });    
  }

  selectStack(stack) {
    // console.log('SELECT STACK CLOSING');
    this.stackEl.openState.next(false);
    this.stack = stack;
    // console.log('SELECT STACK OPENING');
    timer(1200).subscribe(() => {
      console.log('opening....');
      this.stackEl.openState.next(true);
    });
  }

  returnValue(value?) {
    this.closeVisible = false;
    if (this.variable) {
      this.record[this.variable] = value;
    }
    if (this.variable2) {
      this.record[this.variable2] = value;
    }
    // console.log('CLOSING STACK 3');
    this.stackEl.openState.next(false);
    this.returned.next(null);
  }

  wait() {
    return this.returned.pipe(
      first(),
      tap(() => {
        // console.log('CLOSING STACK 2');
        this.stackEl.openState.next(false);
        return this.backend.update(this.record);
      }),
      map(() => {
        const response = this.args.response;
        if (response) {
          return this.params.__runner.fillIn(response);
        } else {
          return false;
        }
      })
    ).toPromise();
  }

  // NG Lifecycle
  ngOnInit(): void {
    this.args = this.params['cards'];
    this.variable = this.args['variable'];
    this.variable2 = this.args['variable2'];
    this.runner = this.params.__runner;
    this.record = this.runner.record;
    this.init.next();
  }

  // Visual Aids
  slideSelectors(slide) {
    this.selectorsSlidden = slide;
  }

  onStackState(state) {
    if (state === 'opening') {
      if (!this.stack.map) {
        const hostEl = this.hostElement.nativeElement as HTMLElement;
        hostEl.parentElement.scrollIntoView({
          block: 'center', inline: 'center', behavior: 'auto' 
        });    
      }
    } else if (state === 'open') {
      this.mainScrollPosition = null;
      this.opened = true;
      this.vScrollSub = this.mainScroll.scrollPosition.pipe(
        filter((pos) => {
          if (this.mainScrollPosition !== null) {
            return Math.abs(this.mainScrollPosition - pos) > 100;
          } else {
            this.mainScrollPosition = pos;
            return false;
          }
        }),
        first()
      ).subscribe(() => {
        this.vScrollSub = null;
        // console.log('CLOSING STACK 1');
        this.stackEl.openState.next(false);
      });
    } else if (state === 'closing') {
      if (this.vScrollSub) {
        this.vScrollSub.unsubscribe();
        this.vScrollSub = null;
        this.mainScrollPosition = null;
      }
    } else if (state === 'closed') {
      this.opened = false;
      this.stacksSvc.closeStack();
      // this.content.setScrollLock(false);
    } else if (state === 'map-opened') {
      this.mapVisible = true;
    } else if (state === 'map-closed') {
      this.mapVisible = false;
      this.slideSelectors(false);
    }
  }  

}
