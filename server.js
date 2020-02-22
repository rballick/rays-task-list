//server.js
'use strict'
const express = require('express');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
const bodyParser = require('body-parser');
const Pusher = require('pusher');
const fs = require('fs');
const moment = require('moment');
require('moment-timezone');
const Task = process.env.NODE_ENV === "production" && false ? require('./model/task') : require('./model/test-task');
const TestTask = require('./model/test-task');
const app = express();
const router = express.Router();

mongoose.set('useFindAndModify', false);

//g7kfnPc_k8Lvxx4m
app.set("port", process.env.PORT || 3001);
if (process.env.NODE_ENV === "production") {
  app.use('/',express.static("client/build"));
}

var pusher = new Pusher({
  appId: '683939',
  key: 'ee9677b636388255d8e5',
  secret: '5f0ce01dfb28c5816efa',
  cluster: 'us2',
  useTLS: true
});

const db_url = process.env.NODE_ENV === 'production' || true ? 'webuser:g7kfnPc_k8Lvxx4m@ds257314.mlab.com:57314/heroku_g6fzwb1w' : 'localhost:27017/task_list';
mongoose.connect(`mongodb://${db_url}`, { useNewUrlParser: true });
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

const prepareNote = (notes,note) => {
	return new Promise((resolve, reject) => {
		note.note_date = moment().tz('America/New_York');
		note.note_details = note.note_details || {};
		note.note_type = note.note_type || 'note';
		notes.unshift(note);
		resolve(notes);
	});
}

router.route('/tasks')
	.get(function(req, res) {
		const params = {};
		if (typeof req.query.date !== 'undefined') params.task_date = req.query.past === 'true' ? {$lt: moment(new Date(req.query.date)).endOf('d').tz('America/New_York').startOf('d')} : moment(new Date(req.query.date)).endOf('day').tz('America/New_York').startOf('d');
		if (typeof req.query.completed !== 'undefined') params.completed = Boolean(Number(req.query.completed));
 		Task.find(params,[],{sort: {task_date:1,task_order: 1}}, function(err, tasks) {
			if (err) {
				console.log(err);
				res.json({erro:err});
				return;
			}
//			res.json(tasks);
		});
	})
	.post(function(req, res) {
		const params = req.body;
		params.task_date = moment(params.task_date).tz('America/New_York').startOf('d');
		params.current_status = "in progress";
		params.creation_date = moment().tz('America/New_York').startOf('d');
		params.completed = false;
		params.notes = [];
		Task.findOne({"task_date": params.task_date}).sort({task_order:-1}).exec(function(err, order) {
			if (err) console.log(err);
			order = order || {task_order:0};
			params.task_order = order.task_order + 1;
			const task = new Task(params);
			task.save(function(err,doc) {
				if (err) console.log(err);
				pusher.trigger('tasks', 'update', {
					[task.task_date]: ['uncompleted']
				});
				res.json(doc);
			});
		});
	});
	

router.route('/tasks/:_id')
	.get(function(req,res) {
		if (req.params._id === '0') {
			res.json(new Task());
		} else {
			Task.findById(req.params._id,function(err, task) {
				if (err) console.log(err);
				res.json(task);
			});
		}
	})
	.put(function(req,res) {
		const params = req.body;
		Task.findByIdAndUpdate(req.params._id,params,function(err, results) {
			if (err) console.log(err);
			pusher.trigger('tasks','update',{[params.task_date]:[params.completed ? 'completed' : 'uncompleted']})
			res.json({success:true});
		});
	});

router.route('/status/:_id')
	.put(function(req, res) {
		const data = req.body.task;
		const note = req.body.note;

		Task.findById(req.params._id,function(err, task) {
			const completed = task.completed;
			if (err) console.log(err);
			prepareNote(task.notes,note).then((notes) => {
				data.notes = notes;
				Task.findByIdAndUpdate(req.params._id,data,function(err, results) {
					if (err) console.log(err);
					const triggers = {
						[task.task_date] : [ data.completed ? 'completed' : 'uncompleted']
					}
					if (completed !== data.completed) triggers[task.task_date].push(data.completed ? 'uncompleted' : 'completed');
					pusher.trigger('tasks','update',triggers);
					res.json({success:true});
				});
			}).catch((err) => {console.log(err);});
		});
	});
	
		
router.route('/test_tasks')
	.get(function(req,res) {
		const uncompleted = ['in progress','delegated','forwarded'];
		const completed = ['deleted','completed'];
		TestTask.find({}).sort({task_date:1,completed:1,task_order:1}).exec(function(err, tasks) {
			res.json(tasks);
		});
	})
	.put(function(req,res) {
		const uncompleted = ['in progress','delegated','forwarded'];
		const completed = ['deleted','completed'];
		TestTask.find({}).sort({completed:1,task_order:1}).exec(function(err, tasks) {
			if (err) console.log(err);
			
			const updateTasks = (tasks) => {
				const triggers = {};
				const start = typeof req.query.d === 'undefined' ? -2 : Number(req.query.d);
				let d = start;
				let i;
				let c = false;
				Array.from(tasks).forEach((task,index) => {
					if (index !== 6 && index < 15 && index%3 === 0) {
						d++;
						i = 1 - index;
					}
					if (index >= 15 && index%2 === 1) {
						c = true;
						if (index === 15) d = start;
						d++;
						i = 4 - index;
						if (d === start + 2) i += 3;
					}
					const notes = [
						{
							note_type: 'note',
							note_date: moment().tz('America/New_York').startOf('d'),
							note: 'Note 1',
							note_details: {}
						},
						{
							note_type: 'note',
							note_date: moment().tz('America/New_York').startOf('d'),
							note: 'Note 2',
							note_details: {}
						},
						{
							note_type: 'note',
							note_date: moment().tz('America/New_York').startOf('d'),
							note: 'Note 3',
							note_details: {}
						}
					];
					task.notes = notes;
					const params = { 'task_order' : index + i, 'task_name': `Task ${index + i}`,completed:c,notes:task.notes};
					const task_type = c ? 'completed' : 'uncompleted';
					params.current_status = index < 15 ? uncompleted[index%3] : completed[index%2];
					params.task_date = moment().tz('America/New_York').startOf('d').add(d,'d');
					params.task_details = `These are the details for ${params.task_name}`;
					params.forwarded = false;
					if (params.current_status === 'forwarded') {
						params.current_status = 'in progress';
						params.forwarded = true;
						task.notes.unshift({
							note_type: 'status',
							note_date: moment().tz('America/New_York').startOf('d'),
							note: 'forwarded',
							note_details: {
								to: params.task_date,
								from: task.task_date
							}
						});
					}
					if (typeof triggers[params.task_date] === 'undefined') triggers[params.task_date] = [task_type];
					if (triggers[params.task_date].indexOf(task_type) === -1) triggers[params.task_date].push(task_type);
					if (index < 19) {
						TestTask.findByIdAndUpdate(task._id, { $set: params}, { new: true }, function (err, order) {
						  if (err) console.log(err);
						  if (index === tasks.length - 1) {
							pusher.trigger('tasks', 'update', triggers);
							res.send('Records updated');
						  }
						});
					} else {
						TestTask.findByIdAndDelete(task._id, function (err, order) {
						  if (err) console.log(err);
						  if (index === tasks.length - 1) {
							pusher.trigger('tasks', 'update', triggers);
							res.send('Records updated');
						  }
						});
					}
				});
			}
			if (tasks.length < 19) {
				const newTasks = [];
				for (let x=0;x<19-tasks.length;x++) {
					newTasks.push(new TestTask());
				}
				TestTask.insertMany(newTasks).then((docs)=>{
					tasks = [...tasks,...newTasks];
					updateTasks(tasks);
				});
			} else {
				updateTasks(tasks);
			}
		});
	});

router.route('/reorder/:_id')
	.put(function(req,res) {
		const to = Number(req.body.to);
		Task.findById(req.params._id,(err, reorder) => {
			const task_order = reorder.task_order < to ? {$gt: reorder.task_order, $lte:to } : {$lt: reorder.task_order, $gte: to };
			const s = reorder.task_order < to ? 1 : -1;
			Task.find({'task_order':task_order,'task_date':reorder.task_date},[],{sort:{task_order:s}},(err, tasks) => {
				if (err) console.log(err);
				Array.from(tasks).forEach((task) => {
					task.task_order = task.task_order - s;
					task.save((err) => {
						if (err) console.log(err);
						if(task.task_order === to + 1 || task.task_order === to - 1) {
							reorder.task_order = to;
							reorder.save((err) => {
								if (err) console.log(err);
								pusher.trigger('tasks', 'update', {[task.task_date] : 'uncompleted'});
								res.json({success:true});
							});
						}
					});
				});
			});
		});
	});
	
router.route('/forward')
	.post(function(req,res) {
		const from = moment(req.body.from).endOf('d').tz('America/New_York').startOf('d');
		const date = moment(req.body.date).endOf('d').tz('America/New_York').startOf('d');
		Task.findOne({"task_date": date}).sort({task_order:-1}).exec(function(err, order) {
			if (err) {
				console.log(err);
				res.json({errr:err});
				return;
			}
			const task_order = order ? order.task_order + 1 : 1;
			Task.find({task_date:{$lt:from},completed:false},[],{sort:{task_order:1,task_date:1}},function(err,tasks) {
				if (err) console.log(err);
				tasks = Array.from(tasks);
//				res.json({tasks:tasks,date:date,from:from});
//				return;
				tasks.forEach((task, index) => {
					task.task_order = 0;
					task.task_date = date;
					task.task_order = task_order + index;
					prepareNote(task.notes,{note_type:'status',note_date:date,note:'forwarded',note_details:{from:task.task_date,to:date}}).then((notes) => {
						task.notes = notes;
						task.save((err) => {
							if (err) console.log(err);
							console.log(`${index+1} === ${tasks.length}`);
							if (index+1 === tasks.length) {
								const now = from.clone();
								const triggers = {};
								while (now.isBefore(date) || now.isSame(date)) {
									triggers[now] = ['uncompleted'];
									now.add(1,'d')
								}
								pusher.trigger('tasks','update',triggers);
								res.json({success:true});
							}
						});
					}).catch((err)=>{res.send(err)});;
				});
			});
		});
	});
		
router.route('/forward/:_id')
	.put(function(req,res) {
		req.body.to = moment(req.body.to).endOf('d').tz('America/New_York').startOf('d')
		Task.findOne({"task_date": req.body.to}).sort({task_order:-1}).exec(function(err, order) {
			if (err) console.log(err);
			const task_order = order === null ? 0 : order.task_order;
			Task.findById(req.params._id,function(err, task) {
				const task_date = task.task_date;
				if (err) console.log(err);
				prepareNote(task.notes,{note_type: 'status', note: 'forwarded', note_details: {to:req.body.to, from: task.task_date}}).then((notes) => {
					const triggers = {
						[task.task_date] : [ task.completed ? 'completed' : 'uncompleted' ],
					};
					task.forwarded = true;
					task.notes = notes;
					task.task_order = task_order + 1;
					task.task_date = req.body.to;
					triggers[task.task_date] = [ task.completed ? 'completed' : 'uncompleted' ];
					task.save(function (err) {
						if (err) console.log(err);
						pusher.trigger('tasks','update',triggers);
						res.json({success:true});
					});
				}).catch((err) => { console.log(err); });
			});
		});
	});
	
app.use('/api', router);

mongoose.connection.on("connected", function(ref) {
	console.log("Connected to db " + mongoose.connection.name + " on port " + mongoose.connection.port)
});

app.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});
