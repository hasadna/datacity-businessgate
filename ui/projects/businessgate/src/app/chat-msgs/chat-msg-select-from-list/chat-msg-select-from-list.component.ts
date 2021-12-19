import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ContentManager } from 'hatool';
import { ReplaySubject } from 'rxjs';
import { first, map, switchMap, tap } from 'rxjs/operators';
import { BackendService } from '../../backend.service';
import { DataService } from '../../data.service';
import { MapService } from '../../map.service';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-chat-msg-select-from-list',
  templateUrl: './chat-msg-select-from-list.component.html',
  styleUrls: ['./chat-msg-select-from-list.component.less']
})
export class ChatMsgSelectFromListComponent implements OnInit {

  @Input() params;
  @Input() content: ContentManager;
  @ViewChild('input', {static: false}) inputEl: ElementRef;

  args: any = {};
  record: any = {};
  items: any[] = [];
  _done = false;
  typed = ''; 
  stack = [];

  selection = new ReplaySubject<string>(1);

  constructor(private data: DataService, private backend: BackendService, private mapSvc: MapService, private widgets: WidgetsService) { }

  ngOnInit(): void {
    this.done = false;
    this.args = this.params['select-from-list'];
    this.record = this.params.__runner.record;
    if (this.params.__runFast) {
      if (this.record[this.args.variable]) {
        this.done = true;
        this.selection.next(this.record[this.args.variable]);
        return;
      }
    }

    if (this.args.source === 'business_kinds') {
      this.data.businesses_property_tax.pipe(
        first(),
        map((result: any[]) => {
          return result.map((x) => {
            return {
              value: x.business_kind,
              display: x.business_kind
            };
          });
        })
      ).subscribe((result) => {
        this.items = result;
      })
    }
    if (this.args.source === 'locations') {
      this.data.stacks.pipe(
        first(),
        switchMap((stacks) => {
          const commercial_areas = stacks['commercial-areas'].cards;
          this.items = commercial_areas
            .filter((x) => x.geometry)
            .map((x) => {
              if (!x.pointGeometry) {
                x.pointGeometry = this.mapSvc.calculatePoint(x.geometry);
              }
              return {
                display: 'מתחם עסקי: ' + x.title,
                value: Object.assign(x, {שם: x.title})
              };
            });
          return this.data.locations;
        }),
        first(),
      ).subscribe((result) => {
        this.items.push(...result);
      })
    }
  }

  set done(value) {
    this._done = value;
    this.widgets.selecting = !value;
  }

  get done() {
    return this._done;
  }

  selected(item) {
    if (item.value) {
      this.done = true;
      this.selection.next(item.value);  
    } else {
      this.stack.unshift({prefix: item.display, items: this.items});
      this.inputEl.nativeElement.value = item.display + ' ';
      this.items = item.items;
    }
  }

  wait() {
    return this.selection.pipe(
      first(),
      tap((value) => {
        this.record[this.args.variable] = value;
        this.record[this.args.variable2] = value;
      }),
      tap(() => {
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

  highlight(item) {
    if (this.typed) {
      const parts = this.typed.split(/\s+/);
      let ret = item
      for (const part of parts) {
        ret = ret.replace(part, `<b>${part}</b>`)
      }
      return ret;
    }
    return item
  }

  search(x) {
    this.typed = x;
    if (this.stack && this.stack.length > 0 && x.indexOf(this.stack[0].prefix) === -1) {
      const p = this.stack.shift();
      this.items = p.items;
    }
    for (const i of this.items) {
      x = x.split(/\s+/).sort().join(' ');
      const display = i.display.split(/\s+/).sort().join(' ');
      if (x === display && i.items) {
        this.selected(i);
      }
    }
  }

  matches(str, sub, def) {
    if (sub && sub.length) {
      const parts = sub.split(/\s+/);
      for (const part of parts) {
        if (part.length === 0) {
          continue;
        }
        if (str.indexOf(part) < 0) {
          return false;
        }
      }
    }
    return def;
  }

  visible(item) {
    return this.matches(item, this.typed, true);
  } 

}
