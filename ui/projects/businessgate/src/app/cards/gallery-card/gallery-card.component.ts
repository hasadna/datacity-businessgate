import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-gallery-card',
  templateUrl: './gallery-card.component.html',
  styleUrls: ['./gallery-card.component.less']
})
export class GalleryCardComponent implements OnInit {

  @Input() width = 0;
  @Input() card;
  @Input() params;
  @Input() active;
  @Output() selected = new EventEmitter<any>();

  constructor() { }

  ngOnInit(): void {
  }

  image() {
    return this.card.image || 'assets/img/dummy-location.png';
  }

  select(value) {
    this.selected.emit(value);
  }
}
