import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-a11y',
  templateUrl: './widget-sidepage-a11y.component.html',
  styleUrls: ['./widget-sidepage-a11y.component.less']
})
export class WidgetSidepageA11yComponent implements OnInit {

  content: any = {content: ''};
  marked = marked;

  constructor(private data: DataService) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.a11y;
    });
  }


  ngOnInit(): void {
  }

}
