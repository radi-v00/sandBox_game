interface Entry<T> {
  value: T;
  priority: number;
  seq: number;
}

/** Binary min-heap. Equal priorities pop in insertion order, so the search is deterministic. */
export class MinHeap<T> {
  private items: Entry<T>[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  push(value: T, priority: number): void {
    this.items.push({ value, priority, seq: this.counter++ });
    this.siftUp(this.items.length - 1);
  }

  pop(): { value: T; priority: number } | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return { value: top.value, priority: top.priority };
  }

  private less(a: Entry<T>, b: Entry<T>): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq);
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.items[i]!, this.items[parent]!)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(this.items[left]!, this.items[smallest]!)) smallest = left;
      if (right < n && this.less(this.items[right]!, this.items[smallest]!)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = tmp;
  }
}
