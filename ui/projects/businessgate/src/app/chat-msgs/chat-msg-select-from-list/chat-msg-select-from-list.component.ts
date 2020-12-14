import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ContentManager } from 'hatool';
import { ReplaySubject } from 'rxjs';
import { first, map, switchMap, tap } from 'rxjs/operators';
import { BackendService } from '../../backend.service';
import { DataService } from '../../data.service';
import { MapService } from '../../map.service';

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
  done = false;
  typed = ''; 
  stack = [];

  selection = new ReplaySubject<string>(1);

  constructor(private data: DataService, private backend: BackendService, private mapSvc: MapService) { }

  ngOnInit(): void {
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
      this.data.businesses.pipe(
        first(),
        map((result: any[]) => {
          return result.map((x) => {
            return {
              value: x.business_kind_name,
              display: x.business_kind_name
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
      return item.replace(this.typed, `<b>${this.typed}</b>`)
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
      if (x === i.display && i.items) {
        this.selected(i);
      }
    }
  }

  visible(item) {
    if (this.typed && this.typed.length) {
      return item.indexOf(this.typed) >= 0; 
    }
    return true;
  } 

}
