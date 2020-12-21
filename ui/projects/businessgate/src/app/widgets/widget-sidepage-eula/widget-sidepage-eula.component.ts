import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-eula',
  templateUrl: './widget-sidepage-eula.component.html',
  styleUrls: ['./widget-sidepage-eula.component.less']
})
export class WidgetSidepageEulaComponent implements OnInit {

  content: any = {content: ''};
  marked = marked;

  constructor(private data: DataService) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.eula;
    });
  }


  ngOnInit(): void {
  }

}
