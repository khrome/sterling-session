(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['sterling', 'async-arrays', 'squalor', 'uuid'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require('sterling'), require('async-arrays'), require('squalor'), require('uuid'));
    } else {
        // Browser globals (root is window)
        root.Sterling.Session = factory(root.Sterling, root.AsyncArrays, root.Squalor, root.UUID);
    }
}(this, function (Sterling, arrays, SQL, uuid) {
    //todo: cookie support

    var SterlingSession =  {
        allowGet : false,
        loginVars : [
            'phone'
        ],
        serve : function(sterlingInstance, datasource, authFunction){
            var controls = {
                handleRequest : function(id, req, res, cb){
                    var query = 'SELECT * from Session where session = "'+id+'"';
                    datasource.query(
                        query,
                        function(error, results, fields){
                            if(error || (!results) || (!results[0])){
                                return cb(new Error('No User, No Session'));
                            }else{
                                var session = results[0];
                                req.session = {}; //eventually session storage, for now falsey
                                var user;
                                req.user = function(cb){
                                    if(user) return cb(undefined, user);
                                    //try{
                                        authFunction({id:session.userid}, function(err, user){
                                            cb(err, user)
                                        });
                                    //}catch(ex){
                                        //cb(ex);
                                    //}
                                };
                                cb(undefined);
                            }
                        }
                    );
                },
                deleteSession : function(id, cb){
                    datasource.query(
                        'DELETE from Session where session = "'+id+'"',
                        function(error, results, fields){
                            cb(error);
                        }
                    );
                },
                createSession : function(u, cb){
                    if(!u) return cb(new Error('User not supplied'))
                    var act = function(user){
                        var id = uuid.v4();
                        if(!user.id) return cb(new Error('User has no ID'));
                        datasource.query(SQL.save('Session', {
                            userid:user.id,
                            session:id
                        }), function (err, results, fields) {
                            if(err) throw err;
                            datasource.query(
                                'SELECT * from Session where session ="'+id+'"',
                                function (err, results, fields){
                                    cb(undefined, results[0]);
                                }
                            );
                        });
                    }
                    if(authFunction){
                        authFunction(u, function(err, user){
                            if(err) return cb(new Error('User not supplied'));
                            act(user);
                        });
                    }else{
                        act(u);
                    }
                }
            };
            var secureRoute = function(route, handler){
                //console.log('SR-a', route);
                sterlingInstance.addRoute(route, function(){
                    //console.log('SR-e', arguments);
                    //the session token is the first arg on the url
                    var args = Array.prototype.slice.call(arguments);
                    var session = arguments[0];
                    var ob = this;
                    controls.handleRequest(session, ob.res, ob.req, function(err){
                        if(!ob.res.user){
                            return sterlingInstance.error(
                                ob.res, new Error('No Authentication Methods'), 401
                            );
                        }
                        if(err) return sterlingInstance.error(ob.res, err, 401);
                        handler.apply(ob, args);
                    });
                });
            }

            sterlingInstance.addSecureRoute = function(route, handler){
                if(typeof handler == 'function'){
                    secureRoute(route, handler);
                }else{
                    Object.keys(handler).forEach(function(method){
                        var lowerMethod = method.toLowerCase();
                        secureRoute(route, handler[lowerMethod]);
                    });
                }
            }

            var prefix = sterlingInstance.prefix || '';
            sterlingInstance.addRoute(prefix+'session/:session', {get:function(session){
                var ob = this;
                controls.handleRequest(session, ob.req, ob.res, function(err){
                    if(err){
                        ob.res.end(JSON.stringify({
                            success: false,
                            data: req.session,
                            error: err.message
                        }));
                    }else{
                        ob.res.end(JSON.stringify({
                            success: true
                        }));
                    }
                });
            }});
            sterlingInstance.addRoute(prefix+'login', {post:function(session){
                var ob = this;
                var cleaned = {};
                SterlingSession.loginVars.forEach(function(key){
                    cleaned[key] = ob.req.post[key];
                });
                authFunction(cleaned, function(err, user){
                    controls.createSession(function(err, id){
                        if(err){
                            ob.res.end(JSON.stringify({
                                success: false,
                                error: err.message
                            }));
                        }else{
                            ob.res.end(JSON.stringify({
                                success: true,
                                session: id
                            }));
                        }
                    });
                });
            }});
            sterlingInstance.addRoute(prefix+'logout/:session/', {get:function(session){
                var ob = this;
                controls.deleteSession(session, ob.res, ob.req, function(err){
                    if(err){
                        ob.res.end(JSON.stringify({
                            success: false,
                            error: err.message
                        }));
                    }else{
                        ob.res.end(JSON.stringify({
                            success: true
                        }));
                    }
                });
            }});
            return controls;
        },
        universal : function(tableName){
            return function(data, cb){
                database.query(SQL.select(tableName, data), function (err, results, fields) {
                    if(err) return error(err, ob.res);
                    if(!results[0]) return error(new Error('Unknown User'), ob.res);
                    var user = results[0];
                    cb(undefined, user);
                });
            }
        }
    };
    return SterlingSession;
}));
