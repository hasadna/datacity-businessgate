import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-simple-card',
  templateUrl: './simple-card.component.html',
  styleUrls: ['./simple-card.component.less']
})
export class SimpleCardComponent implements OnInit {

  @Input() width = 0;
  @Input() card;
  @Input() params;
  @Input() active;

  constructor() { }

  ngOnInit(): void {
  }

}
