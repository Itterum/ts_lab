"use strict";
class Options {
    constructor(name) {
        this.name = name;
    }
    static new(name) {
        return new Options(name);
    }
}
function main() {
    const options = Options.new('test');
    console.log(options);
}
main();
