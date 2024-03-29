import React, { ReactElement, useState, useCallback, useContext } from 'react'
import './Login.scss'
import { AppContext } from '@sasjs/test-framework'
import { Redirect } from 'react-router-dom'

const Login = (): ReactElement<{}> => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const appContext = useContext(AppContext)

  const handleSubmit = useCallback(
    (e: any) => {
      e.preventDefault()
      appContext.adapter.logIn(username, password).then((res) => {
        appContext.setIsLoggedIn(res.isLoggedIn)
      })
    },
    [username, password, appContext]
  )

  return !appContext.isLoggedIn ? (
    <div className="login-container">
      <img src="sasjs-logo.png" alt="SASjs Logo" />
      <form onSubmit={handleSubmit}>
        <div className="row">
          <label>User Name</label>
          <input
            placeholder="User Name"
            value={username}
            required
            onChange={(e: any) => setUsername(e.target.value)}
          />
        </div>
        <div className="row">
          <label>Password</label>
          <input
            placeholder="Password"
            type="password"
            value={password}
            required
            onChange={(e: any) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="submit-button">
          Log In
        </button>
      </form>
    </div>
  ) : (
    <Redirect to="/" />
  )
}

export default Login
