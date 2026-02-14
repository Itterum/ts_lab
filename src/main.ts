interface IOptions {
    name?: string;
}

class Options implements IOptions {
    name?: string;

    private constructor(name: string) {
        this.name = name;
    }

    static new(name: string): Options {
        return new Options(name);
    }
}

function main(): void {
    const options: IOptions = Options.new('test');
    console.log(options);
 }

main();
