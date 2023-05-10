interface Callback<U extends Updateable> { (source: U): void };

export class Updateable {
    /**
     * Provides a standard interface for classes that wish to allow subscribing
     * to updates.
     */
	private updatedHandlers: Callback<this>[];

	protected constructor() {
		this.updatedHandlers = [];
	}

	protected triggerUpdate(): void {
		this.updatedHandlers.forEach((handler) => {
            handler(this);
		});
	}

	public onUpdate(callback: Callback<this>): void {
		this.updatedHandlers.push(callback);
	}
}
