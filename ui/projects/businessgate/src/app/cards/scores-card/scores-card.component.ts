import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-scores-card',
  templateUrl: './scores-card.component.html',
  styleUrls: ['./scores-card.component.less']
})
export class ScoresCardComponent implements OnInit {

  @Input() width = 0;
  @Input() card;
  @Input() params;
  @Input() current;
  @Input() scheme;
  @Input() active;

  constructor() { }

  ngOnInit(): void {
  }

  bar_position(score) {
    return (100 * (1 - score.score_value))+ '%';
  }

}
