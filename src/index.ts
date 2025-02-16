import * as exec from '@actions/exec';
import { Main } from './main'
import { wrapExecutor } from './exec';

const main = new Main(wrapExecutor(exec.exec));
main.run()