

let isDev = (!process.env.NODE_ENV || process.env.NODE_ENV === 'development');
export const IsProduction = !isDev;
export const IsDevelopment = isDev;

