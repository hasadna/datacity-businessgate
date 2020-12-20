import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StacksService {

  stack_cache = {};
  stack_modules = [];
  stack_count = 0;
  width = 0;
  visible = false;
  runner = null;
  discovery = true;

  constructor() { }

  registerStacks(stacks) {
    for (const stack of stacks) {
      this.registerStack(stack);
    }
  }

  registerStack(stack) {
    const module = stack.module;
    const name = stack.name;
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

  colorSchemeClass(stack) {
    if (stack) {
      return 'scheme-' + stack.scheme;
    } else {
      return '';
    }
  }

}
