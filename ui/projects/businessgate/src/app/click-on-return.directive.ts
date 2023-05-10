import { AfterViewInit, Directive, ElementRef, EventEmitter, Output } from '@angular/core';

@Directive({
  selector: '[clickOnReturn]'
})
export class ClickOnReturnDirective implements AfterViewInit{
  @Output() activated = new EventEmitter<Event>();

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    const el: HTMLElement = this.el.nativeElement;
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.keyCode === 13 || event.keyCode === 32) {
        event.preventDefault();
        this.activated.emit(event);
      }
    });
    el.addEventListener('click', (event: KeyboardEvent) => {
      this.activated.emit(event);
    });
    el.setAttribute('tabindex', '0');
    if (el.tagName !== 'button') {
      el.setAttribute('role', 'button');
    }
  }

}
