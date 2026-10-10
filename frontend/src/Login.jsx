// src/Login.jsx
import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';

const components = {
  Header() {
    return (
      <div style={{ textAlign: 'center', paddingBottom: '20px' }}>
        <span style={{ fontSize: '2em', fontWeight: 'bold', color: 'white', letterSpacing: '1px' }}>
            tx
        </span>
      </div>
    );
  }
};

const Login = ({ children }) => {
  return (
    <div className="login-container">
      <Authenticator components={components}>
        {children}
      </Authenticator>
    </div>
  );
};

export default Login;