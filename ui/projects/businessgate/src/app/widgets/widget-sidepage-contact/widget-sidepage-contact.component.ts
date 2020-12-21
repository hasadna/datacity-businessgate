import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-contact',
  templateUrl: './widget-sidepage-contact.component.html',
  styleUrls: ['./widget-sidepage-contact.component.less']
})
export class WidgetSidepageContactComponent implements OnInit {

  content: any = {content: ''};
  marked = marked;

  constructor(private data: DataService) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.contact;
    });
  }

  ngOnInit(): void {
  }

}
