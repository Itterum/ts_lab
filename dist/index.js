"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const yc_data_1 = require("./yc-data");
const cu_data_1 = require("./cu-data");
const diff_1 = require("./diff");
const result = (0, diff_1.getDiff)(yc_data_1.data, cu_data_1.data);
console.log(JSON.stringify(result));
