import colors from 'colors';

const button = (
  color: keyof colors.Color,
  value: any,
  doNotUppercase = typeof value !== 'string' || false
) => colors.inverse.bold[color](` ${doNotUppercase ? value : value.toUpperCase()} `);

const gradient = ['green', 'yellow', 'red'] as const;

export const bold = colors.bold;

export const title = (value: string) => button('cyan', value);

export const separator = (length = 60, text?: string) => {
  const _separator = Array(length).fill('-').join('');

  if (text) {
    const newTextLength = text.length + 4;
    return `${_separator.substring(
      0,
      Math.floor(length / 2) - Math.floor(newTextLength / 2)
    )} ${button('magenta', text)} ${_separator.substring(
      Math.floor(length / 2) - Math.floor(newTextLength / 2) + newTextLength
    )}`;
  }
  return _separator;
};

export const scriptName = (value: string) => button('green', value, true);

export const duration = (seconds: number | string) => {
  let color;
  if (seconds < 1) {
    color = gradient[0];
  } else if (seconds < 5) {
    color = gradient[1];
  } else {
    color = gradient[2];
  }
  return button(color, `${seconds}s`, true);
};

export const status = (status: string) => {
  let color: keyof colors.Color;
  if (status === 'success') {
    color = 'green';
  } else if (status === 'warning') {
    color = 'yellow';
  } else if (status === 'error') {
    color = 'red';
  } else {
    color = 'gray';
  }
  return button(color, status, true);
};

export const argValue = (value: any) => {
  const color = 'yellow';
  if (typeof value === 'string' && value.length > 20) {
    return colors.bold[color](value);
  }
  return button(color, value);
};

export const resultValue = (value: any) => {
  const color = 'blue';
  if (typeof value === 'string' && value.length > 20) {
    return colors.bold[color](value);
  }
  return button(color, value);
};

export const error = (value: any) => colors.red(value);

export const confirmMessage = (value: any) =>
  colors.underline(`${colors.bold.red('\n/!\\')} ${colors.yellow(value)}`);
