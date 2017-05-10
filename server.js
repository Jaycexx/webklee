const express = require('express');
const fs = require('fs');
const cp = require('child_process');

const bodyParser = require('body-parser');
const glob = require('glob');
const co = require('co');

let app = express();

app.set('views', './views');
app.set('view engine', 'pug');

//中间件
app.use(express.static('res'));
// 添加json解析
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//route
app.get('/', (req, res) => {
  res.render('index', {});
});

app.post('/generateTest', (req, res) => {
  console.log(req.body.code);
  let code = '#include "klee_src/include/klee/klee.h" \t\n' + req.body.code;
  fs.writeFile('../test.c', code, (err) => {
    if (err) throw err;
    console.log('Writing to test.c..');

    //执行clang -emit-llvm -g -c test.c -o test.bc
    cp.execSync('clang -emit-llvm -g -c ../test.c -o ../test.bc', { encoding: 'utf-8' });

    co(function* () {
      const p1 = new Promise((resolve, reject) => {
        //执行命令，获取输出字符；获取生成的测试用例数量，计算覆盖率
        getTestInfo(resolve);
      });
      const p2 = new Promise((resolve, reject) => {
        //遍历测试用例，取出测试用例
        getTestcase(resolve);
      });
      let testInfo, testcase;
      [testInfo, testcase] = yield [p1, p2];
      console.log('resolve testInfo:', testInfo);
      console.log('resolve testcase:', testcase);
      let rate = (parseInt(testInfo.completePath) / parseInt(testInfo.explorePath)) * 100;
      //输出到页面模板
      res.render('testcase', {
        testInfo: testInfo,
        testcase: testcase,
      });
    })

  });
});

app.listen(3000, () => {
  console.log('Listening on 3000..');
});

////////////////////其他函数///////////////////////
function getTestInfo(resolve) {
  let ret = {};
  //获取信息字符串
  let str = cp.execSync('klee test.bc', { encoding: 'utf-8' });
  //let str = fs.readFileSync('./doc/kleebc.txt', 'utf-8');
  let r1 = /explored paths = (\d+)/, r2 = /completed\cpaths\s=\s(\d+)/, r3 = /tests\s=\s(\d+)/;
  ret.explorePath = str.match(r1)[1];
  ret.completePath = str.match(r2)[1];
  ret.testcase = str.match(r3)[1];
  console.log('Reading kleebc.txt..\n', str);
  console.log('Match explore path:', ret.explorePath);
  console.log('Match complete path:', ret.completePath);
  console.log('Match testcase:', ret.testcase);
  resolve(ret);
}

function getTestcase(resolve) {
  let testcase = [];
  //获取字符data: 0
  glob('doc/test*.ktest', (err, files) => {
    let str;
    let r1 = /data: (-?\d+)/;
    for (let file of files) {
      let cmd = 'ktest-tool --write-ints ' + file;
      str = cp.execSync(cmd, { encoding: 'utf-8' });
      //str = fs.readFileSync(file, 'utf-8');
      testcase.push(str.match(r1)[1]);
      console.log('Reading ktest file..\n', str);
      console.log('Match testcase:', str.match(r1));
    }
    console.log('testcase:', testcase);
    resolve(testcase);
  });
}
