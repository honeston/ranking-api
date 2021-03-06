const express = require('express');
const app = express();
const port = 3000
const bodyParser = require('body-parser')
app.use(bodyParser.json());

const mysql = require('mysql2/promise');

const db_setting = {
    host: 'db',
    user: process.env.DB_USER,
    password: process.env.DB_KEY,
    database: process.env.DB_NAME
}

ini();

async function ini(){


  // ルーティング
  app.post('/api/rank',rankPOST);

  app.listen(port,()=>{
    console.log("start");
  });
}

// ランキングのPOST処理の呼び出し
async function rankPOST(req, res){

  let connection = await mysql.createConnection(db_setting);

  if (req.body.userID != undefined&&
    req.body.name != undefined&&
    req.body.score != undefined&&
    req.body.rank_name != undefined){
    try {

       await connection.beginTransaction();

        var [isExist,isTopScore] = await checkAlreadyRank(req,connection);

        // ハイスコの場合保存、すでにデータがあれば更新、無ければ挿入
        if (isExist){
          if (isTopScore){
            await updateRank(req,connection);
          }
        }else{
          await insertRank(req,connection);
        }

        // 返答
        await responceData(req, res,connection);

        await connection.commit();

    } catch (err) {
        await connection.rollback();
        console.log(err);
        res.json({
            status: "error",
            error: "fail to uplord data"
        })
    } finally {
        connection.end()
        return
    }
  }else{
    res.json({
        status: "error",
        error: "input key not faund",
        describe: "{\n\"userID\": 12185,\n\"name\": \"user_id_139\",\n\"score\": 99999998}"
    })
  }
}
//返信データを作成して返信する
async function responceData(req, res,connection){
  var course = {};
  course.status = "correct";
  var rank = await getRank(req,connection);
  course.rank = rank[0].rank;
  course.rank_name = req.body.rank_name;
  var rows = await selectRankTopN(req,10,connection);
  course.rank_data_Top = [];
  await rows.forEach((roll) => {
    course.rank_data_Top.push(
     {
        name: roll.name,
        score: roll.score
    });
  });

  var rowss = await selectRankNearN(req,10,course.rank,connection);
  course.rank_data_Near = [];
  await rowss.forEach((rolls) => {
    course.rank_data_Near.push(
     {
        name: rolls.name,
        score: rolls.score
    });
  });

  console.log(course);
  await res.send(course);
}

//ランキングdbに挿入する
async function insertRank(req,connection){
  const insert = "INSERT INTO rankdata set ?;";
  console.log(insert);
  const data = {
      userID: req.body.userID,
      name: req.body.name,
      score: req.body.score,
      rank_name: req.body.rank_name
  }
  const [row2] = await connection.query(insert, data);
}

//ランキングdbに更新する
async function updateRank(req,connection){
  const insert = "UPDATE rankdata SET score = ? Where userID = ? AND rank_name = ?;";
  console.log(insert);
  const data = [
      req.body.score,
      req.body.userID,
      req.body.rank_name
  ]
  const [row2] = await connection.query(insert, data);
}

//ランキングdbに追加の対象が存在するか
async function checkAlreadyRank(req,connection){
  let d = [req.body.userID,req.body.rank_name]
  const sql = "select * from rankdata Where userID = ? AND rank_name = ?;";
  const [rows, fields] = await connection.execute(sql,d);
  console.log(rows);
  //データがすでに存在するか
  var isExist;
  if (rows.length > 0){
    isExist = true;
  }else{
    isExist = false;
  }
  //スコアが保存済みデータを超えているか
  var isTopScore;
  if (isExist && rows[0].score < req.body.score){
    isTopScore = true;
  }else{
    isTopScore = false;
  }

  return [isExist,isTopScore];
}

//ランキングのデータを取得する
async function selectRankTopN(req,num,connection){
  const sql = "select * from rankdata Where rank_name = ? ORDER BY score DESC LIMIT ?";
  let d = [req.body.rank_name,num]
  var [rows, fields] = await connection.execute(sql,d);
  return rows;
}

//ランキングのデータを取得する
async function selectRankNearN(req,num,rank,connection){
  const sql = "select * from rankdata Where rank_name = ? ORDER BY score DESC LIMIT ?,?";
  var offset = rank-num/2;
  if (offset < 0){
    offset = 0;
  }
  let d = [req.body.rank_name,offset,num]
  var [rows, fields] = await connection.execute(sql,d);
  return rows;
}

//ランキングを取得する
async function getRank(req,connection){
  const sql = "SELECT COUNT(*) + 1 AS rank FROM rankdata WHERE score > ? AND rank_name = ?;";
  let d = [req.body.score,req.body.rank_name];
  console.log(d);
  var [rows, fields] = await connection.execute(sql,d);
  return rows;
}
