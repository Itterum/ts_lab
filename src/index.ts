import {data as ycData} from './yc-data';
import {data as cuData} from './cu-data';
import {getDiff} from './diff';

const result = getDiff(ycData, cuData);
console.log(JSON.stringify(result));
