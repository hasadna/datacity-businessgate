import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-title-card',
  templateUrl: './title-card.component.html',
  styleUrls: ['./title-card.component.less']
})
export class TitleCardComponent implements OnInit {

  @Input() width = 0;
  @Input() stack;
  @Input() params;

  constructor() { }

  ngOnInit(): void {
  }

}
