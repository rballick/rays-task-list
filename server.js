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
const Task = process.env.NODE_ENV === "production" ? require('./model/task') : require('./model/test-task');
const TestTask = require('./model/test-task');
const app = express();
const router = express.Router();

mongoose.set('useFindAndModify', false);

//g7kfnPc_k8Lvxx4m
app.set("port", process.env.PORT || 3001);
if (process.env.NODE_ENV === "production") {
  app.use('/',express.static("client/build"));
  app.use('/dev',express.static("client/dev"));
}

var pusher = new Pusher({
  appId: '683939',
  key: 'ee9677b636388255d8e5',
  secret: '5f0ce01dfb28c5816efa',
  cluster: 'us2',
  useTLS: true
});

const db_url = process.env.NODE_ENV === 'production' || true ? 'webuser:g7kfnPc_k8Lvxx4m@ds257314.mlab.com:57314/heroku_g6fzwb1w' : 'localhost:27017/task_list';
mongoose.connect(`mongodb://${db_url}`, { useNewUrlParser: true, useUnifiedTopology: true });
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
//req.query.past = 'true';
//req.query.date = moment().add(2,'days').format('MM/DD/YYYY');
		if (typeof req.query.date !== 'undefined') params.task_date = req.query.past === 'true' ? {$lt: moment(new Date(req.query.date)).endOf('d').tz('America/New_York').startOf('d')} : moment(new Date(req.query.date)).endOf('day').tz('America/New_York').startOf('d');
		if (typeof req.query.completed !== 'undefined') params.completed = Boolean(Number(req.query.completed));
//params.forwarded = false;
 		Task.find(params,[],{sort: {task_date:1,task_order: 1}}, function(err, tasks) {
			if (err) {
				console.log(err);
				res.json({erro:err});
				return;
			}
			res.json(tasks);
		});
	})
	.post(function(req, res) {
		const params = req.body;
		params.task_date = moment(new Date(params.task_date)).tz('America/New_York').startOf('d');
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

router.route('/notes/:_id')
	.put(function(req, res) {
		Task.findById(req.params._id,function(err, task) {
			if (err) console.log(err);
			prepareNote(task.notes,{note:req.body.note}).then((notes) => {
				Task.findByIdAndUpdate(req.params._id,{notes:notes},function(err, results) {
					if (err) console.log(err);
					const triggers = {
						[task.task_date] : [ task.completed ? 'completed' : 'uncompleted']
					}
					pusher.trigger('tasks','update',triggers);
					res.json({success:true});
				});
			});
		});
	});

router.route('/status/:_id')
	.put(function(req, res) {
		const data = req.body.task;
		const note = req.body.note;
		Task.findById(req.params._id,function(err, task) {
			if (data.current_status === 'forwarded') data.current_status = task.current_status;
			const completed = task.completed;
			const sendTrigger = (task,data) => {
				const triggers = {
					[task.task_date] : [ data.completed ? 'completed' : 'uncompleted']
				}
				if (completed !== data.completed) triggers[task.task_date].push(data.completed ? 'uncompleted' : 'completed');
				pusher.trigger('tasks','update',triggers);
				res.json({success:true});
			}
			if (err) console.log(err);
			prepareNote(task.notes,note).then((notes) => {
				data.notes = notes;
				Task.findByIdAndUpdate(req.params._id,data,function(err, results) {
					if (err) console.log(err);
					if (note.note === 'forwarded') {
						const task_order = results.task_order;
						const task_date = results.task_date;
						Task.findOne({"task_date": moment(new Date(note.note_details.to))}).sort({task_order:-1}).exec(function(err, order) {
							if (err) console.log(err);
							Task.findByIdAndUpdate(req.params._id,{"task_date":moment(new Date(note.note_details.to)),task_order:(order === null ? 1 : order.task_order+1)},function(err, results) {
								if (err) console.log(err);
								Task.find({"task_date":task_date,task_order:{$gt:task_order}},[],{sort: {task_order: 1}}, function(err, tasks) {
									tasks.forEach((t,i) => {
										Task.findByIdAndUpdate(t._id,{"task_order":task_order+i},function(err,results) {
											if (i === tasks.length - 1) sendTrigger(task,data);
										});
									});
								});
							});
						});
					} else {
						sendTrigger(task,data);
					}
				});
			}).catch((err) => {console.log(err);});
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
		const from = moment(new Date(req.body.from)).endOf('d').tz('America/New_York').startOf('d');
		const date = moment(new Date(req.body.to)).endOf('d').tz('America/New_York').startOf('d');
		Task.findOne({"task_date": date}).sort({task_order:-1}).exec(function(err, order) {
			if (err) {
				console.log(err);
				res.json({err:err});
				return;
			}
			const task_order = order ? order.task_order + 1 : 1;
			const task_date = req.body.one ? from : {$lt:from}; 
			Task.find({task_date:task_date,completed:false},[],{sort:{task_order:1,task_date:1}},function(err,tasks) {
				if (err) console.log(err);
				tasks = Array.from(tasks);
				tasks.forEach((task, index) => {
					task.task_order = 0;
					task.task_date = date;
					task.task_order = task_order + index;
					prepareNote(task.notes,{note_type:'status',note_date:date,note:'forwarded',note_details:{from:task.task_date,to:date}}).then((notes) => {
						task.notes = notes;
						task.save((err) => {
							if (err) console.log(err);
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
	
router.route('/test_tasks')
	.get(function(req,res) {
		const uncompleted = ['in progress','delegated','forwarded'];
		const completed = ['deleted','completed'];
		TestTask.find({}).sort({task_date:1,completed:1,task_order:1}).exec(function(err, tasks) {
			res.json(tasks);
		});
	})
	.put(function(req,res) {
		let d = typeof req.query.start === 'undefined' ? -1 : Number(req.query.start);
		const days = typeof req.query.days === 'undefined' ? 4 : Number(req.query.days);
		const r = typeof req.query.repeat === 'undefined' ? 2 : Number(req.query.repeat)
		const taskNumber = (d < 0 ? Math.abs(d) * 5 : 0) + (d > 0 ? days*3 : ((days - Math.abs(d) - 1) * 3) + ((3*r)+2));
		const uncompleted = ['in progress','delegated','forwarded'];
		const completed = ['deleted','completed'];
		const triggers = {};
		const taskArray = [];
		TestTask.find({}).sort({completed:1,task_order:1}).exec(function(err, tasks) {
			if (err) console.log(err);
			const updateTasks = (tasks) => {
				const ret = [];
				let date = moment().add(d,'day');
				for (let index=0;index<taskNumber;index++) {
					const count = date.isBefore(moment(),'day') ? 5 : (date.isAfter(moment(),'day') ? 3 : (3*r)+2);
					for (let i=0;i<count;i++) {
						const task = tasks[index + i];
						taskArray.push(task);
						const notes = [
							{
								note_type: 'note',
								note_date: moment().tz('America/New_York').startOf('d'),
								note: 'Note 1',
								note_details: {}
							},
							{
									_type: 'note',
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
						let task_type = 'uncompleted';
						const task_date = task.task_date;
						Object.assign(task,{ 
							task_order : i + 1, 
							task_name: `Task ${i + 1}`,
							completed:false,
							forwarded: false,
							notes:notes,
							current_status: uncompleted[i%3],
							task_date: moment(date).tz('America/New_York').startOf('d'),
							task_details: `These are the details for ${task.task_name}`,
							creation_date: moment().tz('America/New_York')
						});
						if (date.isSameOrBefore(moment(),'day') && i >= count - 2) {
							task_type = 'completed';
							task.current_status = completed[(count-i)%2];
							task.completed = true;
						}
						if (task.current_status === 'forwarded') {
							task.current_status = 'in progress';
							task.forwarded = true;
							task.notes.unshift({
								note_type: 'status',
								note_date: moment().tz('America/New_York').startOf('d'),
								note: 'forwarded',
								note_details: {
									to: moment(task.task_date).format('MM/DD/YYYY'),
									from: task_date
								}
							});
						}
						if (typeof triggers[task.task_date] === 'undefined') triggers[task.task_date] = [task_type];
						if (triggers[task.task_date].indexOf(task_type) === -1) triggers[task.task_date].push(task_type);
						ret.push(task);
					}
					date = moment().add(++d,'day');
					index += count-1;
				}
				ret.forEach((task,i) => {
					TestTask.findByIdAndUpdate(task._id, task, function (err, order) {
					  if (err) console.log(err);
					  if (i === tasks.length - 1) {
						pusher.trigger('tasks', 'update', triggers);
						res.send('Records updated');
					  }
					});
				});

				if (ret.length < tasks.length) {
					for (let i = ret.length;i<tasks.length;i++) {
						const task = tasks[i];
						TestTask.findByIdAndDelete(task._id, function (err, order) {
						  if (err) console.log(err);
						  if (i === tasks.length - 1) {
							pusher.trigger('tasks', 'update', triggers);
							res.send('Records updated');
						  }
						});
					}
				}

			}
			if (tasks.length <= taskNumber) {
				const newTasks = [];
				for (let x=0;x<=taskNumber-tasks.length;x++) {
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

app.use('/api', router);

mongoose.connection.on("connected", function(ref) {
	console.log("Connected to db " + mongoose.connection.name + " on port " + mongoose.connection.port)
});

app.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});
