import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StacksService {

  stack_cache = {};
  stack_modules = [];
  stack_count = 0;
  stack_visible_count = 0;
  width = 0;
  runner = null;
  discoveryRequested = true;
  discovery = false;
  closedStack = new Subject<void>();

  constructor() { }

  registerStacks(stacks, fillIn) {
    for (const stack of stacks) {
      this.registerStack(stack, fillIn);
    }
  }

  registerStack(stack, fillIn) {
    const module = stack.module;
    const name = fillIn(stack.title + ' ' + stack.subtitle);
    if (!!this.stack_cache[name]) {
      return;
    }
    this.stack_count += 1;
    this.stack_cache[name] = stack;
    for (const stack_module of this.stack_modules) {
      if (stack_module.module === module) {
        stack_module.stacks.push(name);
        return;
      }
    }
    this.stack_modules.push({
      module: module, stacks: [name]
    });
  }

  closeStack() {
    this.closedStack.next();
  }

  updateVisibleCount() {
    this.stack_visible_count = this.stack_count;
  }

  updateDiscovery() {
    const ret = this.discoveryRequested;
    this.discovery = ret;
    this.discoveryRequested = false;
    return ret;
  }

  colorSchemeClass(stack) {
    if (stack) {
      return 'scheme-' + stack.scheme;
    } else {
      return '';
    }
  }

  clear() {
    this.stack_cache = {};
    this.stack_count = 0;
    this.stack_visible_count = 0;
    this.stack_modules = [];
  }

  get visible() {
    return this.stack_visible_count !== 0;
  }

}
