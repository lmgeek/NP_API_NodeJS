// const dbConnection = require('dbConnections');
var express = require('express');
var request = require('superagent');
var bodyParser = require('body-parser');
var app = express();
var mysql = require('mysql');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// const dbCon = dbConnection();

var connect = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'nueva_3'
});

connect.connect(function(error, res) {
  if (!!error) {
    console.log('Error');
  } else {
    console.log('Connected');
    console.log(res);
  }
})


app.get('/', function (req, res) {
  connect.query('SELECT * FROM setting_mailchimp',function(err, rows, fields){
    if (!!err) {
      console.log('Error in the query');
    } else {

      var mailchimpInstance   = rows[0].instance,                                      //raiz de la url <dc> o al final del apikey -us20
          listUniqueId        = rows[0].unique_id,                            //id de la lista de correo
          mailchimpApiKey     = rows[0].api_key,    //Api MailChimp
          mailchimpClientId   = rows[0].oauth_client_id;                            //id de app para OAuth
          mailchimpSecretKey  = rows[0].oauth_secret_key;        // clave de OAuth
      console.log('Successful query');
      res.json(rows);
    }
  });
});

app.use(express.static('views'));





// var mailchimpInstance   = 'us20',                                      //raiz de la url <dc> o al final del apikey -us20
//     listUniqueId        = 'e6c481e8ea',                            //id de la lista de correo
//     mailchimpApiKey     = '22464419be952a73b7b9ea86c1d3b974-us20',    //Api MailChimp
//     mailchimpClientId   = '295276760915';                            //id de app para OAuth
//     mailchimpSecretKey  = 'e60e3231bd3d58685285d7ad62aa9b523bd1593abb9f54adaf';        // clave de OAuth

app.post('/signup', function (req, res) {
  connect.query('SELECT * FROM setting_mailchimp',function(err, rows, fields){
    if (!!err) {
      console.log('Error in the query');
    } else {

      var mailchimpInstance   = rows[0].instance,                                      //raiz de la url <dc> o al final del apikey -us20
          listUniqueId        = rows[0].unique_id,                            //id de la lista de correo
          mailchimpApiKey     = rows[0].api_key,    //Api MailChimp
          mailchimpClientId   = rows[0].oauth_client_id;                            //id de app para OAuth
          mailchimpSecretKey  = rows[0].oauth_secret_key;        // clave de OAuth
      console.log('Successful query');
      
      if (listUniqueId == '') {
        res.send('<h1>No se ha seleccionado ninguna lista de Correos</h1>');
      }

      request
        .post('https://' + mailchimpInstance + '.api.mailchimp.com/3.0/lists/' + listUniqueId + '/members/')
        .set('Content-Type', 'application/json;charset=utf-8')
        .set('Authorization', 'Basic ' + new Buffer('any:' + mailchimpApiKey ).toString('base64'))
        .send({
          'email_address': req.body.email,
          'status': 'subscribed',
          'merge_fields': {
            'FNAME': req.body.firstname,
            'LNAME': req.body.lastname
          }
        })
            .end(function(err, response) {
              if (response.status < 300 || (response.status === 400 && response.body.title === "Member Exists")) {
                res.send('Se agregó a la lista de correos');
              } else {
                res.send('No pudo ser agregado a la lista de correos');
              }
          });


    }
  });
});

var querystring = require('querystring');

app.get('/mailchimp/auth/authorize', function(req, res) {
  res.redirect('https://login.mailchimp.com/oauth2/authorize?' +
            querystring.stringify({
                'response_type': 'code',
                'client_id': mailchimpClientId,
                'redirect_uri': 'http://127.0.0.1:5000/mailchimp/auth/callback'
            }));
});

var dataStore = require('./dataStore.js');

app.get('/mailchimp/auth/callback', function(req, res) {
  request.post('https://login.mailchimp.com/oauth2/token')
         .send(querystring.stringify({
            'grant_type': 'authorization_code',
            'client_id': mailchimpClientId,
            'client_secret': mailchimpSecretKey,
            'redirect_uri': 'http://127.0.0.1:5000/mailchimp/auth/callback',
            'code': req.query.code
          }))
            .end((err, result) => {
                if (err) {
                    res.send('An unexpected error occured while trying to perform MailChimp oAuth');
                } else {
                  // we need to get the metadata for the user 
                  request.get('https://login.mailchimp.com/oauth2/metadata')
                    .set('Accept', 'application/json')
                    .set('Authorization', 'OAuth ' + result.body.access_token)
                        .end((err, metaResult) => {
                            if (err) {
                                res.send('An unexpected error occured while trying to get MailChimp meta oAuth');
                            } else {
                                // save the result.body.access_token
                                // save the metadata in result.body
                                // against the current user
                                var mailchimpConf = metaResult.body;
                                console.log(mailchimpConf);
                                mailchimpConf.access_token = result.body.access_token;
                                dataStore.saveMailchimpForUser(mailchimpConf.login.email, mailchimpConf);
                                res.redirect('/pick-a-list.html?email=' + mailchimpConf.login.email);
                            }
                        });
                }
            });
});

app.get('/mailchimp/lists', function(req, res) {
  var mailchimpConf = dataStore.getMailchimpForUser(req.query.email);
  request.get(mailchimpConf.api_endpoint + '/3.0/lists')
                .set('Accept', 'application/json')
                .set('Authorization', 'OAuth ' + mailchimpConf.access_token)
                    .end((err, result) => {
                        if (err) {
                            res.status(500).json(err);
                        } else {
                            res.json(result.body.lists);
                        }
                    });
});

app.get('/mailchimp/list/members/:id', function(req, res) {
  var mailchimpConf = dataStore.getMailchimpForUser(req.query.email);
  request.get(mailchimpConf.api_endpoint + '/3.0/lists/' + req.params.id + '/members')
                .set('Accept', 'application/json')
                .set('Authorization', 'OAuth ' + mailchimpConf.access_token)
                    .end((err, result) => {
                        if (err) {
                            res.status(500).json(err);
                        } else {
                            res.json(result.body.members);
                        }
                    });
});

app.listen(5000, function () {
  console.log('NerdCom Pro NodeJS API listening on port 5000!');
});