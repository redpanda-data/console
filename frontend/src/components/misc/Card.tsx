import React, { ReactNode, Component, CSSProperties } from "react";


class Card extends Component<{ style?: CSSProperties }> {

    render() {
        return <div className='kowlCard' style={this.props.style}>
            {this.props.children}
        </div>
    }
}

export default Card;
