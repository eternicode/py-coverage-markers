type Callback<U extends Updateable> = (source: U) => void;

export class Updateable {
  /**
   * Provides a standard interface for classes that wish to allow subscribing
   * to updates.
   */
  private readonly updatedHandlers: Array<Callback<this>>;

  protected constructor() {
    this.updatedHandlers = [];
  }

  public onUpdate(callback: Callback<this>): void {
    this.updatedHandlers.push(callback);
  }

  protected triggerUpdate(): void {
    for (const handler of this.updatedHandlers) {
      handler(this);
    }
  }
}
