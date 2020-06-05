//server.js
'use strict'
const { Task, TestTask } = require('./task.js');
const MyPusher = require('./pusher');

const moment = require('moment');
require('moment-timezone');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const router = express.Router();

//g7kfnPc_k8Lvxx4m
app.set("port", process.env.PORT || 3001);
if (process.env.NODE_ENV === "production") {
  app.use('/',express.static("client/build"));
  app.use('/dev',express.static("client/dev"));
}

app.use('/api', bodyParser.urlencoded({ extended: true }));
app.use('/api', bodyParser.json());
//To prevent errors from Cross Origin Resource Sharing, we will set 
//our headers to allow CORS with middleware like so:
app.use('/api', function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers');
//and remove cacheing so we get the most recent comments
  res.setHeader('Cache-Control', 'no-cache');
  next();
});
app.use('/api', router);

app.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});

router.route('/tasks')
  .get(function(req, res) {
	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask();
    const params = {};
    if (typeof req.query.date !== 'undefined') params.task_date = req.query.past === 'true' ? {$lt: moment(new Date(req.query.date)).endOf('d').tz('America/New_York').startOf('d')} : moment(new Date(req.query.date)).endOf('day').tz('America/New_York').startOf('d');
    if (typeof req.query.completed !== 'undefined') params.completed = Boolean(Number(req.query.completed));
     objTask.find(params,[],{sort: {task_date:1,task_order: 1}})
		.then((tasks) => res.json(tasks))
		.catch((err) => {
			console.log(err);
			res.json([]);
		})
  })
  .post(function(req, res) {
	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask();
	const pusher = new MyPusher();
	let return_value;
	objTask.addTask(req.body)
		.then((task) => {return_value=task;pusher.trigger('tasks','update',{[task.task_date]:[task.completed ? 'completed' : 'uncompleted']})})
		.then((result) => res.json(return_value))
		.catch((err) => res.json({err:err}));
  });

router.route('/tasks/:_id')
  .get(function(req,res) {
	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask()
	objTask.findById(req.params._id).then(task=>res.json(task)).catch((err)=>console.log(err));
  })
  .put(function(req,res) {

	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask();
	const pusher = new MyPusher();
    objTask.updateTask(req.params._id,req.body)
		.then((task) => {pusher.trigger('tasks','update',{[task.task_date]:[task.completed ? 'completed' : 'uncompleted']});res.json(task);})
		.catch((err) => {
			console.log(err);
			res.json({success: false});
		});
  });

router.route('/notes/:_id')
  .put(function(req, res) {
	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask()
	const pusher = new MyPusher();
	objTask.addNote(req.params._id,req.body.note)
		.then((task)=>pusher.trigger('tasks','update',{[task.task_date] : [ task.completed ? 'completed' : 'uncompleted' ]}))
		.then((result) => res.json(result))
		.catch((err) => {console.log(err);res.json({success:false});});
  });

router.route('/status/:_id')
  .put(function(req, res) {
	const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask()
	const pusher = new MyPusher();
	objTask.changeStatus(req.params._id,req.body.status,req.body.details || {})
	.then((task) => res.json(task))
	.catch((err) => res.json({err:err}));
  });

router.route('/reorder/:_id')
	.put(function(req,res) {
		const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask()
		const pusher = new MyPusher();
		objTask.reorderTask(req.params._id,req.body.to)
		.then((result) => res.json(result))
	});
	
router.route('/forward')
	.post((req, res) => {
		const objTask = process.env.NODE_ENV === "production" ? new Task() : new TestTask()
		const pusher = new MyPusher();
		objTask.forwardTasks(req.body.start,req.body.end,req.body.to)
		.then((result) => res.json(result))
		.catch((err) => res.json({err:err}));
	});
	